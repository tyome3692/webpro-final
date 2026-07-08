type CanvasCourse = {
  id: number;
  name: string;
};

type CanvasSubmission = {
  workflow_state?: string;
  missing?: boolean;
  submitted_at?: string | null;
};

type CanvasAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  html_url: string;
  submission?: CanvasSubmission;
};

type CanvasQuiz = {
  id: number;
  title: string;
  html_url: string;
  quiz_type: "assignment" | "practice_quiz" | "graded_survey" | "survey";
  due_at: string | null;
  lock_at: string | null;
  time_limit: number | null;
};

type CanvasCalendarEvent = {
  id: number;
  title: string;
  start_at: string | null;
  location_name: string | null;
  html_url: string;
};

export type AssignmentStatus = "graded" | "submitted" | "missing" | "unsubmitted";

export type AssignmentDto = {
  id: number;
  title: string;
  course: string;
  due_at: string;
  status: AssignmentStatus;
  html_url: string;
};

export type ExamDto = {
  id: number;
  title: string;
  course: string;
  date: string;
  location: string | null;
  time_limit: number | null;
  html_url: string;
};

export type TimetableSlot = { day: number; period: number };

export type ParsedCourseTitle = {
  code: string;
  term: string | null;
  slots: TimetableSlot[];
  instructor: string;
  course: string;
  campus: string;
  rooms: string[];
};

export type TimetableEntry = {
  id: number;
  course: string;
  instructor: string;
  term: string | null;
  campus: string;
  rooms: string[];
  slots: TimetableSlot[];
  html_url: string;
};

// .env が未設定のときに投げる（controller は 500 にマッピングする）
export class CanvasConfigError extends Error {}
// Canvas がトークン無効/期限切れ(401)を返したときに投げる（controller は 502 にマッピングする）
export class CanvasAuthError extends Error {}
// Canvas が 404 を返したときに投げる（機能が無効な科目など。呼び出し元で空扱いにできるよう区別する）
class CanvasNotFoundError extends Error {}

function getConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.CANVAS_BASE_URL;
  const token = process.env.CANVAS_TOKEN;

  if (!baseUrl || !token) {
    throw new CanvasConfigError(
      "CANVAS_BASE_URL または CANVAS_TOKEN が設定されていません。.env を確認してください。"
    );
  }
  if (!baseUrl.startsWith("https://")) {
    throw new CanvasConfigError("CANVAS_BASE_URL は https:// で始まる必要があります。");
  }

  // 末尾スラッシュを取り除き、パス連結時に // にならないようにする
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

// Canvas API を1回叩く。トークンは常に Authorization ヘッダで送る（クエリには絶対に載せない）
async function canvasFetch(path: string, baseUrl: string, token: string): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    throw new CanvasAuthError(
      "Canvasトークンが無効か期限切れです。再発行して .env を更新してください。"
    );
  }
  if (res.status === 404) {
    throw new CanvasNotFoundError(`Canvas APIエラー: HTTP 404`);
  }
  if (!res.ok) {
    throw new Error(`Canvas APIエラー: HTTP ${res.status}`);
  }

  return res;
}

async function fetchActiveCourses(baseUrl: string, token: string): Promise<CanvasCourse[]> {
  const res = await canvasFetch(
    "/api/v1/courses?enrollment_state=active&per_page=100",
    baseUrl,
    token
  );
  return (await res.json()) as CanvasCourse[];
}

async function fetchAssignmentsForCourse(
  courseId: number,
  baseUrl: string,
  token: string
): Promise<CanvasAssignment[]> {
  // TODO: 課題数が多い科目では Link ヘッダに rel="next" が付く。将来的には全ページたどって取得すること。
  const res = await canvasFetch(
    `/api/v1/courses/${courseId}/assignments?include[]=submission&order_by=due_at&per_page=100`,
    baseUrl,
    token
  );
  return (await res.json()) as CanvasAssignment[];
}

async function fetchQuizzesForCourse(
  courseId: number,
  baseUrl: string,
  token: string
): Promise<CanvasQuiz[]> {
  // TODO: 小テスト数が多い科目では Link ヘッダに rel="next" が付く。将来的には全ページたどって取得すること。
  try {
    const res = await canvasFetch(`/api/v1/courses/${courseId}/quizzes?per_page=100`, baseUrl, token);
    return (await res.json()) as CanvasQuiz[];
  } catch (err) {
    // 小テスト機能が無効な科目などは 404 になる。エラーにせず「小テストなし」として扱う。
    if (err instanceof CanvasNotFoundError) {
      return [];
    }
    throw err;
  }
}

// タイトルにこれらの語を含むカレンダー予定だけを「試験」とみなす（対面試験の精度を上げるため）
const EXAM_TITLE_PATTERN = /試験|期末|中間|exam/i;

async function fetchExamCalendarEventsForCourse(
  courseId: number,
  baseUrl: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<CanvasCalendarEvent[]> {
  const params = new URLSearchParams({
    type: "event",
    start_date: startDate,
    end_date: endDate,
    per_page: "100",
  });
  params.append("context_codes[]", `course_${courseId}`);

  try {
    const res = await canvasFetch(`/api/v1/calendar_events?${params.toString()}`, baseUrl, token);
    return (await res.json()) as CanvasCalendarEvent[];
  } catch (err) {
    // カレンダー機能が使えない科目などは 404 になりうる。エラーにせず「予定なし」として扱う。
    if (err instanceof CanvasNotFoundError) {
      return [];
    }
    throw err;
  }
}

// 課題1件の提出状況から status を決定する
function determineStatus(assignment: CanvasAssignment): AssignmentStatus {
  const submission = assignment.submission;

  if (submission?.workflow_state === "graded") {
    return "graded";
  }
  if (submission?.workflow_state === "submitted" || submission?.submitted_at) {
    return "submitted";
  }

  const isPastDue = assignment.due_at !== null && new Date(assignment.due_at).getTime() < Date.now();
  if (submission?.missing === true || isPastDue) {
    return "missing";
  }

  return "unsubmitted";
}

// 履修中の全科目から課題を取得し、締め切り順に整形して返す
export async function getAssignments(statusFilter?: string): Promise<AssignmentDto[]> {
  const { baseUrl, token } = getConfig();

  const courses = await fetchActiveCourses(baseUrl, token);

  // 科目ごとに順番にリクエストする（並列に投げると Canvas 側のレート制限で 403 になることがあるため）
  let assignments: AssignmentDto[] = [];
  for (const course of courses) {
    const courseAssignments = await fetchAssignmentsForCourse(course.id, baseUrl, token);
    const mapped = courseAssignments
      .filter((a) => a.due_at !== null) // 締め切りなしの課題は除外
      .map(
        (a): AssignmentDto => ({
          id: a.id,
          title: a.name,
          course: course.name,
          due_at: a.due_at as string,
          status: determineStatus(a),
          html_url: a.html_url,
        })
      );
    assignments = assignments.concat(mapped);
  }

  if (statusFilter === "unsubmitted") {
    assignments = assignments.filter((a) => a.status === "unsubmitted" || a.status === "missing");
  }

  assignments.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  return assignments;
}

// 履修中の全科目から「試験」とみなせる小テスト（quiz_type === "assignment"）と
// カレンダー予定（対面試験など）を取得し、日付順にまとめて返す
export async function getExams(): Promise<ExamDto[]> {
  const { baseUrl, token } = getConfig();

  const courses = await fetchActiveCourses(baseUrl, token);

  const now = new Date();
  const startDate = `${now.getFullYear()}-01-01`;
  const endDate = `${now.getFullYear()}-12-31`;

  // 科目ごとに順番にリクエストする（並列に投げると Canvas 側のレート制限で 403 になることがあるため）
  let exams: ExamDto[] = [];
  for (const course of courses) {
    const quizzes = await fetchQuizzesForCourse(course.id, baseUrl, token);
    const examQuizzes = quizzes
      .filter((q) => q.quiz_type === "assignment")
      .map((q) => ({ quiz: q, date: q.due_at ?? q.lock_at }))
      .filter((entry): entry is { quiz: CanvasQuiz; date: string } => entry.date !== null)
      .map(
        ({ quiz, date }): ExamDto => ({
          id: quiz.id,
          title: quiz.title,
          course: course.name,
          date,
          location: null, // Quizzes からは取得できない
          time_limit: quiz.time_limit,
          html_url: quiz.html_url,
        })
      );

    const calendarEvents = await fetchExamCalendarEventsForCourse(
      course.id,
      baseUrl,
      token,
      startDate,
      endDate
    );
    const examEvents = calendarEvents
      .filter((e) => e.start_at !== null && EXAM_TITLE_PATTERN.test(e.title))
      .map(
        (e): ExamDto => ({
          id: e.id,
          title: e.title,
          course: course.name,
          date: e.start_at as string,
          location: e.location_name ?? null,
          time_limit: null, // カレンダー予定には制限時間の概念が無い
          html_url: e.html_url,
        })
      );

    exams = exams.concat(examQuizzes, examEvents);
  }

  exams.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return exams;
}

const DAY_MAP: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 };

// 履修科目タイトル（Canvas の course.name）を解析して時間割の1コマ分の情報を取り出す。
// 書式に合わないタイトル（お知らせ用コースなど）は null を返し、時間割からは除外する。
export function parseCourseTitle(name: string): ParsedCourseTitle | null {
  const m = name
    .trim()
    .match(/^(\S+)\s+(春|秋|通年|集中|その他)?\s*\[([^\]]*)\](.*?)\s*\[([^\]]+)\]\s*$/);
  if (!m) return null;
  const [, code, term, slotStr, mid, placeStr] = m;

  // "月2 月3 月4" → [{day:0,period:2}, ...]
  const slots = (slotStr.match(/[月火水木金土日]\d+/g) || []).map((tok) => ({
    day: DAY_MAP[tok[0]],
    period: Number(tok.slice(1)),
  }));

  // "今井 倫太　情報工学実験第１Ｂ" を全角スペースで分割
  const idx = mid.indexOf("　");
  const instructor = idx >= 0 ? mid.slice(0, idx).trim() : "";
  const course = (idx >= 0 ? mid.slice(idx + 1) : mid).trim();

  // "矢上 12-203, 12-204" → campus + rooms[]
  const place = placeStr.trim();
  const sp = place.indexOf(" ");
  const campus = sp >= 0 ? place.slice(0, sp) : place;
  const roomsPart = sp >= 0 ? place.slice(sp + 1) : "";
  const rooms = roomsPart
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { code, term: term ?? null, slots, instructor, course, campus, rooms };
}

// 履修中の全科目のタイトルを解析し、時間割として組み立てて返す
export async function getTimetable(termFilter?: string): Promise<TimetableEntry[]> {
  const { baseUrl, token } = getConfig();

  const courses = await fetchActiveCourses(baseUrl, token);

  let timetable = courses
    .map((c) => ({ course: c, parsed: parseCourseTitle(c.name) }))
    .filter(
      (entry): entry is { course: CanvasCourse; parsed: ParsedCourseTitle } =>
        entry.parsed !== null && entry.parsed.slots.length > 0
    )
    .map(
      ({ course, parsed }): TimetableEntry => ({
        id: course.id,
        course: parsed.course,
        instructor: parsed.instructor,
        term: parsed.term,
        campus: parsed.campus,
        rooms: parsed.rooms,
        slots: parsed.slots,
        html_url: `${baseUrl}/courses/${course.id}`,
      })
    );

  if (termFilter !== undefined) {
    timetable = timetable.filter((entry) => entry.term === termFilter);
  }

  return timetable;
}

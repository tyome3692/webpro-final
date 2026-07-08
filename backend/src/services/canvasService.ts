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

export type AssignmentStatus = "graded" | "submitted" | "missing" | "unsubmitted";

export type AssignmentDto = {
  id: number;
  title: string;
  course: string;
  due_at: string;
  status: AssignmentStatus;
  html_url: string;
};

// .env が未設定のときに投げる（controller は 500 にマッピングする）
export class CanvasConfigError extends Error {}
// Canvas がトークン無効/期限切れ(401)を返したときに投げる（controller は 502 にマッピングする）
export class CanvasAuthError extends Error {}

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

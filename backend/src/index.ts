import express from "express";
import cors from "cors";
import classroomsRouter from "./routes/classrooms.js";
import assignmentsRouter from "./routes/assignments.js";
import examsRouter from "./routes/exams.js";
import timetableRouter from "./routes/timetable.js";

const app = express();
// const PORT = 3000;
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/classrooms", classroomsRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/exams", examsRouter);
app.use("/api/timetable", timetableRouter);

// app.listen(PORT, () => {
//   console.log(`Server is running at http://localhost:${PORT}`);
// });

app.listen(PORT, () => console.log(`listening on ${PORT}`));
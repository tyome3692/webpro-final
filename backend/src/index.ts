import express from "express";
import cors from "cors";
import classroomsRouter from "./routes/classrooms.js";
import assignmentsRouter from "./routes/assignments.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/classrooms", classroomsRouter);
app.use("/api/assignments", assignmentsRouter);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

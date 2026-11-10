import { notFound } from "next/navigation";
import { EnginePlayground } from "./playground";

export default function DevEnginePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EnginePlayground />;
}

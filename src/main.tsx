import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ActivityTimerPreview } from "./demo/ActivityTimerPreview";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActivityTimerPreview />
  </StrictMode>,
);

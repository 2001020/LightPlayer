import { createRoot } from "react-dom/client";
import "../../src/shared/fonts";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

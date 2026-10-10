import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { StartupSplash } from "./app/StartupSplash";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
    <StartupSplash />
  </StrictMode>,
);

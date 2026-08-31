import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme";
import "./styles.css";
import "./executive.css";
import "./premium.css";
import "./human.css";
import "./login.css";
import "./data-chips.css";
import "./tour.css";
import "./reference.css";
import { DynamicContent } from "./dynamicContent";
const Root = lazy(() => import("./ProductionApp"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DynamicContent>
        <Suspense
          fallback={
            <div className="app-boot" role="status" aria-live="polite">
              <span />
            </div>
          }
        >
          <Root />
        </Suspense>
      </DynamicContent>
    </ThemeProvider>
  </React.StrictMode>,
);

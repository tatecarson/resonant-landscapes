import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// The webfont stylesheet is fetched with media="print" so it stays off the
// critical path, and applying it is this line's job. index.html did it with an
// inline onload handler until a Content-Security-Policy arrived that will not
// run one; the failure was silent — the walk simply stayed in its fallback
// stack (rl-6dt). Here it runs as ordinary bundled script, allowed by
// script-src 'self', at about the moment the first React paint lands anyway.
document
    .querySelectorAll<HTMLLinkElement>('link[data-font-css][media="print"]')
    .forEach((link) => {
        link.media = "all";
    });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

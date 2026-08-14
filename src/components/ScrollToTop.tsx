import { useEffect } from "react";

const ScrollToTop = () => {
  useEffect(() => {
    const scrollForCurrentView = () => {
      const isFolderView = /^\/client\/[^/]+\/folder\/[^/]+\/?$/.test(
        window.location.pathname,
      );

      if (!isFolderView) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const folderContent = document.querySelector<HTMLElement>(
            "section.space-y-6",
          );

          if (folderContent) {
            folderContent.scrollIntoView({
              behavior: "auto",
              block: "start",
            });
          } else {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }
        });
      });
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args) => {
      originalPushState(...args);
      scrollForCurrentView();
    };

    window.history.replaceState = (...args) => {
      originalReplaceState(...args);
      scrollForCurrentView();
    };

    window.addEventListener("popstate", scrollForCurrentView);
    scrollForCurrentView();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", scrollForCurrentView);
    };
  }, []);

  return null;
};

export default ScrollToTop;

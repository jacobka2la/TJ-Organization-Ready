import { useEffect } from "react";

const ScrollToTop = () => {
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args) => {
      originalPushState(...args);
      scrollToTop();
    };

    window.history.replaceState = (...args) => {
      originalReplaceState(...args);
      scrollToTop();
    };

    window.addEventListener("popstate", scrollToTop);
    scrollToTop();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", scrollToTop);
    };
  }, []);

  return null;
};

export default ScrollToTop;

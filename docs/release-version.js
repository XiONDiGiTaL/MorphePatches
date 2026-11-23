/* The release version shown in the hero and the footer.
 *
 * It used to be typed into the markup, so the page kept advertising a version the mirror had already
 * moved past. The version and its date now come from the metadata the mirror actually serves:
 * patches-bundle.json at the root of the GitGud project. That file is what Morphe reads as the patch
 * source, so the number on the page is the number a client gets.
 *
 * GitGud's raw URLs send no CORS header; its API does, so the same file is read through the API.
 *
 * Three outcomes, and the page only ever prints one of them:
 *
 *   a version   the metadata resolved and carries a version, so it is shown
 *   unverified  the fetch has not answered yet, which is also what no-JavaScript visitors see
 *   unavailable the request failed or the payload had no version; the value turns red and says so
 *
 * The markup ships "unverified" instead of a number, so nothing on the page claims a version before
 * the mirror has been asked.
 */
(function () {
  "use strict";

  var API =
    "https://gitgud.io/api/v4/projects/xiondigital%2FMorphePatches/repository/files/" +
    "patches-bundle.json/raw?ref=main";

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function setText(selector, value, failed) {
    each(selector, function (el) {
      el.textContent = value;
      el.classList.toggle("is-error", Boolean(failed));
      if (failed) {
        el.setAttribute("title", "Could not read patches-bundle.json from the GitGud mirror");
      } else {
        el.removeAttribute("title");
      }
    });
  }

  function fail(reason) {
    setText("[data-release-version]", "unavailable", true);
    setText("[data-release-date]", "unknown", true);
    if (window.console && window.console.error) {
      window.console.error("release metadata: " + reason + " (" + API + ")");
    }
  }

  function render(data) {
    var version = data && data.version ? String(data.version).trim() : "";
    if (!version) {
      fail("patches-bundle.json has no version");
      return;
    }

    setText("[data-release-version]", "v" + version, false);

    var date = data && typeof data.created_at === "string" ? data.created_at.slice(0, 10) : "";
    setText("[data-release-date]", /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "unknown", false);
  }

  if (!window.fetch) {
    fail("this browser has no fetch");
    return;
  }

  var controller = window.AbortController ? new AbortController() : null;
  var timer = controller
    ? setTimeout(function () {
        controller.abort();
      }, 8000)
    : null;

  fetch(API, { cache: "no-store", signal: controller ? controller.signal : undefined })
    .then(function (response) {
      if (timer) clearTimeout(timer);
      if (response.status !== 200) {
        fail("the metadata returned " + response.status);
        return;
      }
      return response.json().then(render, function () {
        fail("the metadata is not JSON");
      });
    })
    .catch(function (error) {
      if (timer) clearTimeout(timer);
      fail(error && error.name === "AbortError" ? "the request timed out" : "the request failed");
    });
})();

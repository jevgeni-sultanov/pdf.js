/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @typedef {import("./event_utils.js").EventBus} EventBus */
/** @typedef {import("./interfaces.js").IL10n} IL10n */

import {
  docStyle,
  PresentationModeState,
  SidebarView,
} from "./ui_utils.js";

const SIDEBAR_WIDTH_VAR = "--sidebar-width";
const SIDEBAR_MIN_WIDTH = 200; // pixels
const SIDEBAR_RESIZING_CLASS = "sidebarResizing";

/**
 * @typedef {Object} PDFSidebarOptions
 * @property {PDFSidebarElements} elements - The DOM elements.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IL10n} l10n - The localization service.
 */

/**
 * @typedef {Object} PDFSidebarElements
 * @property {HTMLDivElement} outerContainer - The outer container
 *   (encasing both the viewer and sidebar elements).
 * @property {HTMLDivElement} sidebarContainer - The sidebar container
 *   (in which the views are placed).
 * @property {HTMLDivElement} resizer - The DOM element that can be dragged in
 *   order to adjust the width of the sidebar.
 * @property {HTMLDivElement} thumbnailView - The container in which
 *   the thumbnails are placed.
 */

class PDFSidebar {
  #isRTL = false;

  #mouseAC = null;

  #outerContainerWidth = null;

  #width = null;

  /**
   * @param {PDFSidebarOptions} options
   */
  constructor({ elements, eventBus, l10n }) {
    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;
    this.isInitialEventDispatched = false;

    /**
     * Callback used when the sidebar has been opened/closed, to ensure that
     * the viewers (PDFViewer/PDFThumbnailViewer) are updated correctly.
     */
    this.onToggled = null;
    this.onUpdateThumbnails = null;

    this.outerContainer = elements.outerContainer;
    this.sidebarContainer = elements.sidebarContainer;
    this.resizer = elements.resizer;

    this.eventBus = eventBus;

    this.#isRTL = l10n.getDirection() === "rtl";
    this.#addEventListeners();
  }

  reset() {
    this.isInitialViewSet = false;
    this.isInitialEventDispatched = false;

    this.switchView(SidebarView.THUMBS);
  }

  /**
   * @type {number} One of the values in {SidebarView}.
   */
  get visibleView() {
    return this.isOpen ? this.active : SidebarView.NONE;
  }

  /**
   * @param {number} view - The sidebar view that should become visible,
   *                        must be one of the values in {SidebarView}.
   */
  setInitialView(view = SidebarView.NONE) {
    if (this.isInitialViewSet) {
      return;
    }
    this.isInitialViewSet = true;

    // If the user has already manually opened the sidebar, immediately closing
    // it would be bad UX; also ignore the "unknown" sidebar view value.
    if (view === SidebarView.NONE || view === SidebarView.UNKNOWN) {
      this.#dispatchEvent();
      return;
    }
    this.switchView(view, /* forceOpen = */ true);

    // Prevent dispatching two back-to-back "sidebarviewchanged" events,
    // since `this.switchView` dispatched the event if the view changed.
    if (!this.isInitialEventDispatched) {
      this.#dispatchEvent();
    }
  }

  /**
   * @param {number} view - The sidebar view that should be switched to,
   *                        must be one of the values in {SidebarView}.
   * @param {boolean} [forceOpen] - Ensure that the sidebar is open.
   *                                The default value is `false`.
   */
  switchView(view, forceOpen = false) {
    const isViewChanged = view !== this.active;
    let forceRendering = false;

    switch (view) {
      case SidebarView.THUMBS:
        if (this.isOpen && isViewChanged) {
          forceRendering = true;
        }
        break;
      default:
        console.error(`PDFSidebar.switchView: "${view}" is not a valid view.`);
        return;
    }
    // Update the active view *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.active = view;

    if (forceOpen && !this.isOpen) {
      this.open();
      return; // Opening will trigger rendering and dispatch the event.
    }
    if (forceRendering) {
      this.onUpdateThumbnails();
      this.onToggled();
    }
    if (isViewChanged) {
      this.#dispatchEvent();
    }
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.outerContainer.classList.add("sidebarOpen");

    if (this.active === SidebarView.THUMBS) {
      this.onUpdateThumbnails();
    }
    this.onToggled();
    this.#dispatchEvent();
  }

  toggle(evt = null) {
    this.open();
  }

  #dispatchEvent() {
    if (this.isInitialViewSet) {
      this.isInitialEventDispatched ||= true;
    }

    this.eventBus.dispatch("sidebarviewchanged", {
      source: this,
      view: this.visibleView,
    });
  }

  #addEventListeners() {
    const { eventBus, outerContainer } = this;

    // Update the thumbnailViewer, if visible, when exiting presentation mode.
    eventBus._on("presentationmodechanged", evt => {
      if (
        evt.state === PresentationModeState.NORMAL &&
        this.visibleView === SidebarView.THUMBS
      ) {
        this.onUpdateThumbnails();
      }
    });

    // Handle resizing of the sidebar.
    this.resizer.addEventListener("mousedown", evt => {
      if (evt.button !== 0) {
        return;
      }
      // Disable the `transition-duration` rules when sidebar resizing begins,
      // in order to improve responsiveness and to avoid visual glitches.
      outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);

      this.#mouseAC = new AbortController();
      const opts = { signal: this.#mouseAC.signal };

      window.addEventListener("mousemove", this.#mouseMove.bind(this), opts);
      window.addEventListener("mouseup", this.#mouseUp.bind(this), opts);
      window.addEventListener("blur", this.#mouseUp.bind(this), opts);
    });
  }

  /**
   * @type {number}
   */
  get outerContainerWidth() {
    return (this.#outerContainerWidth ||= this.outerContainer.clientWidth);
  }

  /**
   * returns {boolean} Indicating if the sidebar width was updated.
   */
  #updateWidth(width = 0) {
    // Prevent the sidebar from becoming too narrow, or from occupying more
    // than half of the available viewer width.
    const maxWidth = Math.floor(this.outerContainerWidth / 2);
    if (width > maxWidth) {
      width = maxWidth;
    }
    if (width < SIDEBAR_MIN_WIDTH) {
      width = SIDEBAR_MIN_WIDTH;
    }
    // Only update the UI when the sidebar width did in fact change.
    if (width === this.#width) {
      return false;
    }
    this.#width = width;

    docStyle.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
    return true;
  }

  #mouseMove(evt) {
    let width = evt.clientX;
    // For sidebar resizing to work correctly in RTL mode, invert the width.
    if (this.#isRTL) {
      width = this.outerContainerWidth - width;
    }
    this.#updateWidth(width);
  }

  #mouseUp(evt) {
    // Re-enable the `transition-duration` rules when sidebar resizing ends...
    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
    // ... and ensure that rendering will always be triggered.
    this.eventBus.dispatch("resize", { source: this });

    this.#mouseAC?.abort();
    this.#mouseAC = null;
  }
}

export { PDFSidebar };

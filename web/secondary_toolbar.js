/* Copyright 2012 Mozilla Foundation
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

import { toggleExpandedBtn } from "./ui_utils.js";

/**
 * @typedef {Object} SecondaryToolbarOptions
 * @property {HTMLDivElement} toolbar - Container for the secondary toolbar.
 * @property {HTMLButtonElement} toggleButton - Button to toggle the visibility
 *   of the secondary toolbar.
 * @property {HTMLButtonElement} printButton - Button to print the document.
 * @property {HTMLButtonElement} downloadButton - Button to download the
 *   document.
 * @property {HTMLButtonElement} uploadButton - Button to open the document.
 */

class SecondaryToolbar {
  #opts;

  /**
   * @param {SecondaryToolbarOptions} options
   * @param {EventBus} eventBus
   */
  constructor(options, eventBus) {
    this.#opts = options;
    const buttons = [
      { element: options.printButton, eventName: "print", close: true },
      { element: options.downloadButton, eventName: "download", close: true },
      { element: options.uploadButton, eventName: "upload", close: true },
    ];

    this.eventBus = eventBus;
    this.opened = false;

    // Bind the event listeners for click, cursor tool, and scroll/spread mode
    // actions.
    this.#bindListeners(buttons);

    this.reset();
  }

  /**
   * @type {boolean}
   */
  get isOpen() {
    return this.opened;
  }

  setPageNumber(pageNumber) {
    this.pageNumber = pageNumber;
  }

  setPagesCount(pagesCount) {
    this.pagesCount = pagesCount;
  }

  reset() {
    this.pageNumber = 0;
    this.pagesCount = 0;

    // Reset the Scroll/Spread buttons too, since they're document specific.
    this.eventBus.dispatch("switchcursortool", { source: this, reset: true });
  }

  #bindListeners(buttons) {
    const { eventBus } = this;
    const { toggleButton } = this.#opts;
    // Button to toggle the visibility of the secondary toolbar.
    toggleButton.addEventListener("click", this.toggle.bind(this));

    // All items within the secondary toolbar.
    for (const { element, eventName, close, eventDetails } of buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          eventBus.dispatch(eventName, { source: this, ...eventDetails });
        }
        if (close) {
          this.close();
        }
        eventBus.dispatch("reporttelemetry", {
          source: this,
          details: {
            type: "buttons",
            data: { id: element.id },
          },
        });
      });
    }
  }

  open() {
    if (this.opened) {
      return;
    }
    this.opened = true;

    const { toggleButton, toolbar } = this.#opts;
    toggleExpandedBtn(toggleButton, true, toolbar);
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;

    const { toggleButton, toolbar } = this.#opts;
    toggleExpandedBtn(toggleButton, false, toolbar);
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }
}

export { SecondaryToolbar };

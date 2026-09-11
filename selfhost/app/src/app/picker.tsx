"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type PickerOption = {
  value: string;
  label: string;
  hint?: string;
  section?: string;
};

/**
 * A listbox that can actually be styled.
 *
 * A native <select> paints its popup with the operating system, which on this
 * page drops a white Windows menu on top of a dark surface. Everything else
 * here is deliberate, so the one control that could not follow the design gets
 * replaced rather than tolerated. Keyboard behaviour matches the native one:
 * Enter/Space opens, arrows move, Enter commits, Escape closes.
 */
export function Picker(props: {
  id: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  label?: string;
}) {
  const { id, value, options, onChange, label } = props;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? options[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
  }, [open, options, value]);

  // Arrow keys can walk past the visible rows, so the list follows along.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commit(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  let lastSection: string | undefined;

  return (
    <div className="picker" ref={rootRef} data-open={open ? "true" : "false"}>
      <button
        type="button"
        id={id}
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className="picker-value">
          <strong>{selected?.label}</strong>
          {selected?.hint ? <small>{selected.hint}</small> : null}
        </span>
        <span className="picker-caret" aria-hidden="true" />
      </button>

      {open ? (
        <ul
          className="picker-list"
          id={listId}
          role="listbox"
          tabIndex={-1}
          ref={listRef}
        >
          {options.map((option, index) => {
            const heading = option.section && option.section !== lastSection
              ? option.section
              : null;
            lastSection = option.section;
            return (
              <li key={option.value}>
                {heading ? <p className="picker-section">{heading}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="picker-option"
                  data-active={index === activeIndex ? "true" : "false"}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                >
                  <span className="picker-option-label">{option.label}</span>
                  {option.hint ? (
                    <span className="picker-option-hint">{option.hint}</span>
                  ) : null}
                  {option.value === value ? (
                    <span className="picker-check" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

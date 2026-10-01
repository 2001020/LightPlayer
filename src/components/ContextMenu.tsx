// Right-click menu. Open it with `openMenu(event, items)`; one instance is
// mounted in App.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { create } from "zustand";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Nested items shown in a submenu. */
  children?: MenuItem[];
  separator?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[] | null;
}

const useMenu = create<MenuState>(() => ({ x: 0, y: 0, items: null }));

export function openMenu(e: ReactMouseEvent | MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useMenu.setState({ x: e.clientX, y: e.clientY, items });
}

export const sep: MenuItem = { label: "", separator: true };

function closeMenu() {
  useMenu.setState({ items: null });
}

function MenuList({ items, x, y, flipX }: { items: MenuItem[]; x: number; y: number; flipX?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<number | null>(null);
  const [subAt, setSubAt] = useState({ x: 0, y: 0, flip: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    // Submenus flip to the left of their parent when there is no room.
    if (left + r.width > window.innerWidth - 6) left = flipX !== undefined ? flipX - r.width - 2 : window.innerWidth - r.width - 6;
    if (top + r.height > window.innerHeight - 6) top = Math.max(6, window.innerHeight - r.height - 6);
    setPos({ left: Math.max(6, left), top });
  }, [x, y, flipX]);

  return (
    <div className="ctx-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            className={`item ${it.danger ? "danger" : ""} ${it.disabled ? "disabled" : ""} ${open === i ? "open" : ""}`}
            onMouseEnter={(e) => {
              if (it.children) {
                const r = e.currentTarget.getBoundingClientRect();
                setSubAt({ x: r.right + 2, y: r.top - 6, flip: r.left });
                setOpen(i);
              } else setOpen(null);
            }}
            onClick={() => {
              if (it.disabled || it.children) return;
              closeMenu();
              it.onClick?.();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={16} /> : <span style={{ width: 16 }} />}
            <span className="grow">{it.label}</span>
            {it.children && <Icon name="chevronRight" size={14} />}
          </div>
        ),
      )}
      {open !== null && items[open]?.children && <MenuList items={items[open].children!} x={subAt.x} y={subAt.y} flipX={subAt.flip} />}
    </div>
  );
}

export function ContextMenuHost() {
  const { x, y, items } = useMenu();
  useEffect(() => {
    if (!items) return;
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest(".ctx-menu")) closeMenu();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [items]);
  if (!items) return null;
  return <MenuList items={items} x={x} y={y} />;
}

export function isMenuOpen() {
  return useMenu.getState().items !== null;
}

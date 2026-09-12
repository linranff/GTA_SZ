import type { CityGraphicsQuality } from './city-graphics-quality.ts';
import './city-graphics-panel.css';

type GraphicsPanelOptions = {
  getQuality: () => CityGraphicsQuality;
  onChange: (quality: CityGraphicsQuality) => void;
  onOpenChange?: (open: boolean) => void;
};

const LEVELS: readonly { quality: CityGraphicsQuality; label: string; description: string }[] = [
  { quality: 'low', label: '低', description: '轻量流畅' },
  { quality: 'medium', label: '中', description: '均衡画质' },
  { quality: 'high', label: '高', description: '优先细节' },
];
let serial = 0;

/** Mount in #ui to inherit its recording visibility. The owner manages game input. */
export function createCityGraphicsPanel(host: HTMLElement, options: GraphicsPanelOptions) {
  const element = document.createElement('section');
  element.className = 'city-graphics-panel';
  element.setAttribute('aria-label', '画质设置');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'city-graphics-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'city-graphics-menu';
  menu.id = `city-graphics-menu-${++serial}`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '选择画质');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);

  const heading = document.createElement('div');
  heading.className = 'city-graphics-heading';
  heading.setAttribute('role', 'presentation');
  heading.innerHTML = '<span>画面品质</span><span class="city-graphics-eyebrow">随心调整</span>';
  menu.append(heading);

  let open = false;
  let hidden = false;
  let disposed = false;
  let current: CityGraphicsQuality | undefined;

  const choices = LEVELS.map((level) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-graphics-choice';
    button.tabIndex = -1;
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-label', `${level.label}：${level.description}`);
    button.innerHTML = `<span class="city-graphics-level">${level.label}</span><span class="city-graphics-description">${level.description}</span><span class="city-graphics-check" aria-hidden="true">✓</span>`;
    button.addEventListener('click', () => {
      if (disposed || hidden) return;
      options.onChange(level.quality);
      syncQuality();
    });
    menu.append(button);
    return button;
  });
  element.append(trigger, menu);
  host.append(element);

  function syncQuality() {
    const quality = options.getQuality();
    if (current === quality) return;
    current = quality;
    const label = LEVELS.find((level) => level.quality === quality)!.label;
    trigger.textContent = `画质 · ${label}`;
    trigger.setAttribute('aria-label', `画质：${label}，打开画质设置`);
    choices.forEach((button, index) => {
      const selected = LEVELS[index].quality === quality;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('is-selected', selected);
    });
  }

  function setOpen(value: boolean, returnFocus = false) {
    if (disposed || (value && hidden) || value === open) return;
    open = value;
    menu.hidden = !value;
    element.classList.toggle('is-open', value);
    trigger.setAttribute('aria-expanded', String(value));
    options.onOpenChange?.(value);
    if (value) {
      syncQuality();
      choices[Math.max(0, LEVELS.findIndex((level) => level.quality === current))].focus({ preventScroll: true });
    } else if (returnFocus && !hidden) {
      trigger.focus({ preventScroll: true });
    }
  }

  const toggle = () => setOpen(!open, true);
  const containsTarget = (target: EventTarget | null) => target instanceof Node && element.contains(target);
  const stopPointer = (event: Event) => event.stopPropagation();

  function onOutsidePointer(event: PointerEvent) {
    if (open && !containsTarget(event.target)) setOpen(false, true);
  }

  function onFocusIn(event: FocusEvent) {
    if (open && !containsTarget(event.target)) setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disposed || hidden || (!open && !containsTarget(event.target))) return;
    if (!open && !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      // Escape returns focus to the button; the next driving shortcut must work.
      if (document.activeElement instanceof HTMLElement && containsTarget(document.activeElement)) {
        document.activeElement.blur();
      }
      return;
    }
    // Capture before the game's window shortcuts, including M, G, J and Escape.
    // Native Tab navigation is retained; the menu closes before focus leaves it.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false, true);
      }
      return;
    }
    if (event.key === 'Tab') {
      if (open) setOpen(false, true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target instanceof HTMLButtonElement && containsTarget(event.target)) {
        event.preventDefault();
        if (!event.repeat) event.target.click();
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const index = choices.findIndex((button) => button === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : (Math.max(0, index) + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + choices.length) % choices.length;
    choices[next].focus({ preventScroll: true });
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!disposed && !hidden && open) event.stopImmediatePropagation();
  }

  trigger.addEventListener('click', toggle);
  const pointerEvents = ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel'] as const;
  pointerEvents.forEach((event) => element.addEventListener(event, stopPointer));
  window.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('focusin', onFocusIn);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  syncQuality();

  function update(next: { hidden?: boolean }) {
    if (disposed) return;
    hidden = next.hidden ?? hidden;
    if (hidden) setOpen(false);
    element.hidden = hidden;
    syncQuality();
  }

  function dispose() {
    if (disposed) return;
    setOpen(false);
    disposed = true;
    trigger.removeEventListener('click', toggle);
    pointerEvents.forEach((event) => element.removeEventListener(event, stopPointer));
    window.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    element.remove();
  }

  return { element, update, dispose };
}

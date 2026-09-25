import { useEffect, useRef } from "react";

/* Esc는 가장 위에 열린 레이어(모달/메뉴/드로어) 하나만 닫는다. */
const layers = [];

function onKeyDown(event) {
  if (event.key !== "Escape" || layers.length === 0) return;
  event.preventDefault();
  layers[layers.length - 1].current();
}

/**
 * @param active 활성 여부
 * @param onDismiss 닫기 콜백
 * @param containerRef (선택) 지정 시 컨테이너 바깥 mousedown으로도 닫힘
 */
export default function useDismiss(active, onDismiss, containerRef) {
  const handlerRef = useRef(onDismiss);

  useEffect(() => {
    handlerRef.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return undefined;

    const layer = handlerRef;
    layers.push(layer);
    if (layers.length === 1) document.addEventListener("keydown", onKeyDown);

    function onPointerDown(event) {
      const node = containerRef?.current;
      if (node && !node.contains(event.target) && layers[layers.length - 1] === layer) {
        layer.current();
      }
    }
    if (containerRef) document.addEventListener("mousedown", onPointerDown);

    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) document.removeEventListener("keydown", onKeyDown);
      if (containerRef) document.removeEventListener("mousedown", onPointerDown);
    };
  }, [active, containerRef]);
}

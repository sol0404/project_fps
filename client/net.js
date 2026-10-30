// WebSocket 래퍼 — 메시지 타입(t)별 핸들러 등록
export class Net {
  constructor() {
    this.handlers = {};
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => this.handlers.close?.();
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        this.handlers[msg.t]?.(msg);
      };
    });
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

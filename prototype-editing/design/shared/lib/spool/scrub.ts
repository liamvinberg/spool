// Relative mouse movement keeps numeric scrubbing independent of screen edges.
// Pointer capture remains the path for touch, pen, and denied pointer lock.
export function beginScrub(
	element: HTMLElement,
	pointer: PointerEvent,
	update: (units: number, shift: boolean) => void,
	finish: (cancelled: boolean) => void,
): () => void {
	const doc = element.ownerDocument;
	let lastX = pointer.clientX;
	let distance = 0;
	let sent = 0;
	let ended = false;
	let pendingLock = false;
	let locked = false;
	const change = (dx: number, shift: boolean) => {
		if (ended || !Number.isFinite(dx)) return;
		distance += dx;
		const units = Math.round(distance / 4);
		if (units === sent) return;
		update(units - sent, shift);
		sent = units;
	};
	const removeLockListeners = () => {
		doc.removeEventListener("pointerlockchange", lockChange);
		doc.removeEventListener("pointerlockerror", lockError);
	};
	const end = (cancelled: boolean) => {
		if (ended) return;
		ended = true;
		doc.removeEventListener("pointermove", move, true);
		doc.removeEventListener("mousemove", relative, true);
		doc.removeEventListener("pointerup", up, true);
		doc.removeEventListener("mouseup", mouseUp, true);
		doc.removeEventListener("pointercancel", pointerCancel, true);
		element.removeEventListener("lostpointercapture", lostCapture);
		doc.defaultView?.removeEventListener("blur", cancel);
		if (element.hasPointerCapture(pointer.pointerId)) element.releasePointerCapture(pointer.pointerId);
		if (doc.pointerLockElement === element) doc.exitPointerLock();
		// A request can succeed after a very quick release. Keep just these listeners
		// until it settles so that a late lock cannot strand the hidden cursor.
		if (!pendingLock) removeLockListeners();
		finish(cancelled);
	};
	const cancel = () => end(true);
	const move = (event: PointerEvent) => {
		if (event.pointerId !== pointer.pointerId || doc.pointerLockElement === element) return;
		change(event.clientX - lastX, event.shiftKey);
		lastX = event.clientX;
	};
	const relative = (event: MouseEvent) => {
		if (doc.pointerLockElement === element) change(event.movementX, event.shiftKey);
	};
	const up = (event: PointerEvent) => {
		if (event.pointerId === pointer.pointerId && event.button === 0) end(false);
	};
	const mouseUp = (event: MouseEvent) => {
		if (pointer.pointerType === "mouse" && event.button === 0) end(false);
	};
	const pointerCancel = (event: PointerEvent) => {
		if (event.pointerId === pointer.pointerId) cancel();
	};
	const lostCapture = () => {
		if (!pendingLock && !locked) cancel();
	};
	const lockChange = () => {
		if (doc.pointerLockElement === element) {
			pendingLock = false;
			locked = true;
			if (ended) {
				doc.exitPointerLock();
				removeLockListeners();
			}
		} else if (locked) cancel();
	};
	const lockError = () => {
		pendingLock = false;
		if (ended) removeLockListeners();
	};
	doc.addEventListener("pointermove", move, true);
	doc.addEventListener("mousemove", relative, true);
	doc.addEventListener("pointerup", up, true);
	doc.addEventListener("mouseup", mouseUp, true);
	doc.addEventListener("pointercancel", pointerCancel, true);
	element.addEventListener("lostpointercapture", lostCapture);
	doc.defaultView?.addEventListener("blur", cancel);
	doc.addEventListener("pointerlockchange", lockChange);
	doc.addEventListener("pointerlockerror", lockError);
	element.setPointerCapture(pointer.pointerId);
	if (pointer.pointerType === "mouse" && element.requestPointerLock) {
		pendingLock = true;
		try {
			void Promise.resolve(element.requestPointerLock()).catch(lockError);
		} catch {
			lockError();
		}
	}
	return cancel;
}

// Puts a question into Conversational UI's message box and sends it, as if the
// user had typed it. Used by the follow-up suggestion chips (and anything else
// in a message that offers "ask this next"). The box is a controlled Mendix
// text area: its value is set through the native setter, then the input and
// change events let Mendix store it, and the send button appears.

export function sendToChat(text: string, from: Element | null): void {
    const scope = from?.closest(".chat-container") ?? document;
    const box = scope.querySelector<HTMLTextAreaElement>(".mx-name-textAreaUserPrompt textarea, textarea[placeholder]");
    if (!box) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    let tries = 0;
    const click = (): void => {
        const send = scope.querySelector<HTMLButtonElement>(".mx-name-btnSendMessage");
        if (send && !send.disabled && send.offsetParent !== null) { send.click(); return; }
        if (++tries < 20) setTimeout(click, 100);
    };
    setTimeout(click, 100);
}

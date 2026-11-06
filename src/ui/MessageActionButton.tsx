import type { ButtonHTMLAttributes, MouseEvent } from "react";
import {
  invokeMessageAction,
  messageActionDisabled,
  messageActions,
  messageControl,
  type MessageAction,
} from "./message-actions";

export function MessageActionButton({
  node,
  action,
  control = messageControl(node, action),
  busy = false,
  iconOnly = false,
  onInvoke,
  run,
  size = 17,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  node: HTMLElement | null | undefined;
  action: MessageAction;
  /** The native control that decides whether the button is enabled; null leaves it disabled. */
  control?: HTMLElement | null;
  busy?: boolean;
  iconOnly?: boolean;
  size?: number;
  onInvoke?: () => void;
  /** Runs instead of the native control. */
  run?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [Icon, label] = messageActions[action];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      disabled={props.disabled || messageActionDisabled(control, busy)}
      onClick={(event) => {
        onInvoke?.();
        if (run) run(event);
        else invokeMessageAction(node, action);
      }}
    >
      <Icon size={size} />
      {!iconOnly && (children ?? <span>{label}</span>)}
    </button>
  );
}

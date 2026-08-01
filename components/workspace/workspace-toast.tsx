import { Icon } from "./icon";

interface WorkspaceToastProps {
  message: string;
}

export function WorkspaceToast({ message }: WorkspaceToastProps) {
  if (!message) return null;
  return <div className="toast" role="status"><Icon name="check" size={16}/>{message}</div>;
}

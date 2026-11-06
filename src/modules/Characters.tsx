import type { HostAdapter } from "../host/adapter";
import { CharacterPanel } from "./characters/CharacterPanel";
import { CharacterLibrary } from "./characters/CharacterLibrary";

export default function Characters(props: {
  host: HostAdapter;
  management?: boolean;
  onManage?: (group?: string) => void;
}) {
  return props.management ? <CharacterLibrary host={props.host} /> : <CharacterPanel {...props} />;
}

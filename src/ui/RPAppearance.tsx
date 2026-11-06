import { useState } from "react";
import { ChevronLeft, Type } from "./icons";
import type { HostAdapter } from "../host/adapter";
import { useHostSlices } from "./common";
import { Popover } from "./Popover";
import { usePresence } from "./Motion";
import { CastPanel, CastSource } from "./RPCast";
import { Range, Segmented } from "./FieldControls";
import { bounded, readingFields, rpFields } from "./readingFields";

export function RPAppearance({
  host,
  openPortraits,
}: {
  host: HostAdapter;
  /** Opens a world-book entry at its portraits. */
  openPortraits: (book: string, title: string) => void;
}) {
  useHostSlices(host, ["prefs"]);
  const prefs = host.prefs(),
    [anchor, setAnchor] = useState<HTMLElement | null>(null),
    [view, setView] = useState<"appearance" | "cast">("appearance"),
    presence = usePresence(anchor);
  const close = () => {
    setAnchor(null);
    setView("appearance");
  };
  return (
    <>
      <button
        className="wb-rp-tool"
        title="RP 外观"
        aria-label="RP 外观"
        aria-expanded={!!anchor}
        onClick={(e) => (anchor ? close() : setAnchor(e.currentTarget))}
      >
        <Type size={16} />
      </button>
      {presence.value && (
        <Popover
          anchor={presence.value}
          title={view === "cast" ? "立绘阵容" : "RP 外观"}
          className={view === "cast" ? "is-wide" : ""}
          tools={
            view === "cast" && (
              <button onClick={() => setView("appearance")}>
                <ChevronLeft size={13} aria-hidden="true" />
                外观
              </button>
            )
          }
          exiting={presence.exiting}
          onClose={close}
        >
          {view === "cast" ? (
            <CastPanel
              host={host}
              onManage={(book, title) => {
                close();
                openPortraits(book, title);
              }}
            />
          ) : (
            <div className="wb-pop-form">
              <span className="wb-pop-label">对白字体</span>
              <Segmented
                className="wb-font-choices"
                options={readingFields.readingFont.options}
                value={prefs.readingFont || readingFields.readingFont.fallback}
                onChange={(readingFont) => host.preference({ readingFont })}
              />
              <Range
                captioned
                field={rpFields.rpTextSize}
                label="RP 对白字号"
                value={bounded(rpFields.rpTextSize, prefs.rpTextSize)}
                onChange={(rpTextSize) => host.preference({ rpTextSize })}
              />
              <Range
                captioned
                field={rpFields.rpDialogWidth}
                label="RP 对白宽度"
                value={bounded(rpFields.rpDialogWidth, prefs.rpDialogWidth)}
                onChange={(rpDialogWidth) => host.preference({ rpDialogWidth })}
              />
              <Range
                captioned
                field={rpFields.rpSpriteScale}
                label="RP 立绘大小"
                value={bounded(rpFields.rpSpriteScale, prefs.rpSpriteScale)}
                onChange={(rpSpriteScale) => host.preference({ rpSpriteScale })}
              />
              <label className="wb-check">
                <input
                  type="checkbox"
                  checked={prefs.rpTopAuto !== false}
                  onChange={(e) => host.preference({ rpTopAuto: e.target.checked })}
                />
                鼠标悬浮显示顶栏
              </label>
              <label className="wb-check">
                <input
                  type="checkbox"
                  checked={prefs.rpShowPortraits !== false}
                  onChange={(e) => host.preference({ rpShowPortraits: e.target.checked })}
                />
                没有立绘时显示角色画像
              </label>
              <CastSource host={host} onOpen={() => setView("cast")} />
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

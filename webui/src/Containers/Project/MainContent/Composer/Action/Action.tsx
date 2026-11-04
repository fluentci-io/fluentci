import { ChangeEvent, FC } from "react";
import { Terminal } from "@styled-icons/bootstrap";
import { EllipsisVertical } from "@styled-icons/fa-solid";
import { StatefulPopover } from "baseui/popover";
import { Checkbox, STYLE_TYPE } from "baseui/checkbox";
import { Container, ActionName, PopoverButton } from "./styles";
import { Pipeline } from "../NewActionModal/NewActionModalWithData";
import { StatefulMenu } from "baseui/menu";

export type ActionProps = {
  action: Pipeline;
  index: number;
  onClickAction: (action: Pipeline, index: number) => void;
  onDelete: (position: number) => void;
  onDuplicate: (position: number) => void;
  activate: (checked: boolean) => void;
  disabled: boolean;
};

const Action: FC<ActionProps> = (props) => {
  const { action, index, onClickAction, onDelete, onDuplicate, activate } =
    props;
  return (
    <Container
      active={action.active}
      className="action"
      onClick={(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (!(e.target as HTMLElement).className) {
          return;
        }
        if ((e.target as HTMLElement).className) {
          if (typeof (e.target as HTMLElement).className === "object") {
            return;
          }
          if (
            !(e.target as HTMLElement).className.includes("action") &&
            !(e.target as HTMLElement).className.includes("css")
          ) {
            return;
          }
        }
        onClickAction(action, index);
      }}
    >
      {action.logo && (
        <img
          className="action"
          src={action.logo}
          alt={action.name}
          style={{
            backgroundColor:
              action.name.startsWith("deno") ||
              action.name.startsWith("github") ||
              action.name.startsWith("rust") ||
              action.name.startsWith("trivy") ||
              action.name.startsWith("symfony") ||
              action.name.startsWith("flakestry") ||
              action.name.startsWith("symfony") ||
              action.name.startsWith("heroku") ||
              action.name.startsWith("django") ||
              action.name.startsWith("terraform") ||
              action.name.startsWith("prisma")
                ? "#fff"
                : "initial",
            maxWidth: 34,
            borderRadius: 2,
            padding: 5,
            marginRight: 15,
          }}
        />
      )}
      {!action.logo && (
        <Terminal
          size={32}
          color="#fff"
          style={{ marginLeft: 4, marginRight: 15 }}
        />
      )}
      <div
        className="action"
        style={{ display: "flex", flex: 1, overflow: "hidden" }}
      >
        <ActionName>
          {action.actionName || action.command?.split("\n")?.reverse()[0]}
        </ActionName>
      </div>
      <Checkbox
        disabled={props.disabled}
        checked={action?.active}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          activate(e.currentTarget.checked);
        }}
        checkmarkType={STYLE_TYPE.toggle_round}
        overrides={{
          Toggle: {
            style: {
              backgroundColor: "#fff",
              opacity: props.disabled ? 0.5 : 1,
            },
          },
          ToggleTrack: {
            style: {
              backgroundColor: action?.active ? "#441ecdfe" : "#451ecd52",
            },
          },
          ToggleInner: {
            style: {
              backgroundColor: "#fff",
            },
          },
          Checkmark: {
            style: {
              backgroundColor: "#fff",
            },
          },
        }}
      ></Checkbox>

      <StatefulPopover
        placement="bottomRight"
        content={({ close }) => (
          <StatefulMenu
            items={[
              { label: <span style={{ color: "#fff" }}>Duplicate</span> },
              {
                label: <span style={{ color: "#ff0094" }}>Delete action</span>,
              },
            ]}
            overrides={{
              List: {
                style: {
                  border: "1px solid rgb(71 5 94 / 29%)",
                },
              },
              Option: {
                props: {
                  overrides: {
                    ListItem: {
                      style: ({
                        $theme,
                      }: {
                        $theme: { primaryFontFamily: string };
                      }) => ({
                        fontFamily: $theme.primaryFontFamily,
                      }),
                    },
                  },
                },
              },
            }}
            onItemSelect={({
              item,
            }: {
              item: { label: { props: { children: string } } };
            }) => {
              switch (item.label.props.children) {
                case "Delete action":
                  onDelete(index);
                  break;
                case "Duplicate":
                  onDuplicate(index);
                  break;
                default:
                  break;
              }
              close();
            }}
          />
        )}
        accessibilityType={"tooltip"}
      >
        <PopoverButton
          onClick={(e) => e.stopPropagation()}
          disabled={props.disabled}
        >
          <EllipsisVertical size={20} />
        </PopoverButton>
      </StatefulPopover>
    </Container>
  );
};

export default Action;

import { FC, useEffect } from "react";
import { Modal, ModalHeader, ModalBody } from "baseui/modal";
import { Grid } from "@chakra-ui/react";
import { Input } from "baseui/input";
import { PackageIcon } from "@styled-icons/feather";
import { Download } from "@styled-icons/remix-line";
import { Pipeline } from "./NewActionModalWithData";
import { CardFooter, Inner } from "./styles";
import { Controller, useFormContext } from "react-hook-form";
import _ from "lodash";

type NewActionModalProps = {
  onClose: () => void;
  onAdd: (item: Pipeline) => void;
  pipelines:
    | {
        all: Pipeline[];
      }
    | undefined;
  isOpen: boolean;
  onSearch: (keyword: string) => Promise<void>;
};

const NewActionModal: FC<NewActionModalProps> = (props) => {
  const { onClose, onAdd, isOpen, pipelines, onSearch } = props;
  const { control, watch, reset } = useFormContext();
  const keyword = watch("search");

  useEffect(() => {
    _.debounce(async () => await onSearch(keyword), 650)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  return (
    <Modal
      onClose={() => {
        reset();
        onClose();
      }}
      isOpen={isOpen}
      size={"auto"}
      overrides={{
        Dialog: {
          style: ({ $theme }) => ({
            backgroundColor: "#0f0124",
            color: "#fff",
            fontFamily: $theme.primaryFontFamily,
          }),
        },
        Close: {
          style: {
            color: "#fff",
          },
        },
      }}
    >
      <ModalHeader
        style={{
          borderBottom: "1px solid #2e194d",
        }}
      >
        <Controller
          name="search"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              placeholder="Search"
              clearable
              clearOnEscape
              overrides={{
                Root: {
                  style: {
                    border: "none",
                    BorderRadius: "0px !important",
                  },
                },
                Input: {
                  style: ({ $theme }) => ({
                    color: "#fff",
                    backgroundColor: "#0f0124",
                    border: "none !important",
                    outline: "none",
                    caretColor: "#fff",
                    fontFamily: $theme.primaryFontFamily,
                  }),
                },
                InputContainer: {
                  style: {
                    outline: "none",
                    borderBottom: "none !important",
                  },
                },
              }}
            />
          )}
        />
      </ModalHeader>
      <ModalBody
        style={{
          margin: 0,
        }}
      >
        <div
          style={{
            height: "60vh",
            width: "60vw",
            color: "#fff",
            fontFamily: "Lexend",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <Grid templateColumns="repeat(4, 1fr)" gap={20}>
            {pipelines?.all.map((pipeline) => (
              <Inner key={pipeline.id} onClick={() => onAdd(pipeline)}>
                {!pipeline.logo && (
                  <PackageIcon
                    size={35}
                    color="#fff"
                    style={{ marginBottom: 10, padding: 5 }}
                  />
                )}
                {pipeline.logo && (
                  <img
                    src={pipeline.logo}
                    alt={pipeline.name}
                    style={{
                      backgroundColor:
                        pipeline.name.startsWith("deno") ||
                        pipeline.name.startsWith("github") ||
                        pipeline.name.startsWith("rust") ||
                        pipeline.name.startsWith("trivy") ||
                        pipeline.name.startsWith("symfony") ||
                        pipeline.name.startsWith("flakestry") ||
                        pipeline.name.startsWith("symfony") ||
                        pipeline.name.startsWith("heroku") ||
                        pipeline.name.startsWith("django") ||
                        pipeline.name.startsWith("terraform") ||
                        pipeline.name.startsWith("maven") ||
                        pipeline.name.startsWith("cypress") ||
                        pipeline.name.startsWith("sqlfluff") ||
                        pipeline.name.startsWith("sbt") ||
                        pipeline.name.startsWith("prisma")
                          ? "#fff"
                          : "initial",
                      maxWidth: 36,
                      borderRadius: 2,
                      marginBottom: 10,
                      padding: 5,
                    }}
                  />
                )}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {pipeline.name.replace("_pipeline", "")}
                  </div>
                </div>
                <CardFooter>
                  <Download size="18" style={{ marginRight: 5 }} />{" "}
                  {pipeline.downloads}
                </CardFooter>
              </Inner>
            ))}
          </Grid>
        </div>
      </ModalBody>
    </Modal>
  );
};

export default NewActionModal;

import { FC } from "react";
import { Title, Text, Label, Section, Row, DeleteButton } from "../styles";
import ConfirmArchiveProjectModal from "./ConfirmArchiveProjectModal";
import ConfirmDeleteProjectModal from "./ConfirmDeleteProjectModal";
import ConfirmProjectVisibiltyModal from "./ConfirmProjectVisibilityModal";

export type DangerZoneProps = {
  displayRepositorySection: boolean;
  isPublic: boolean;
  isArchived: boolean;
  onChangeVisibility: (confirm?: boolean) => void;
  onArchive: (confirm?: boolean) => void;
  onDelete: (confirm?: boolean) => void;
  onClose: () => void;
  confirmDeleteProjectModalIsOpen: boolean;
  confirmProjectVisibilityModalIsOpen: boolean;
  confirmArchiveProjectModalIsOpen: boolean;
  projectSlug: string;
};

const DangerZone: FC<DangerZoneProps> = (props) => {
  const {
    displayRepositorySection,
    isPublic,
    isArchived,
    confirmArchiveProjectModalIsOpen,
    confirmDeleteProjectModalIsOpen,
    confirmProjectVisibilityModalIsOpen,
    onClose,
    onArchive,
    onChangeVisibility,
    onDelete,
    projectSlug,
  } = props;
  return (
    <>
      <Section style={{ marginTop: 42 }}>
        <Title>Danger Zone</Title>
        <div
          style={{
            marginTop: 20,
          }}
        >
          {displayRepositorySection && (
            <Section>
              <Row>
                <div style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 4 }}>
                    Change project visibility
                  </Label>
                  <Text>
                    This project is currently {isPublic ? "public" : "private"}
                  </Text>
                </div>
                <DeleteButton onClick={() => props.onChangeVisibility()}>
                  {isPublic ? "Make Pipeline Private" : "Make Pipeline Public"}
                </DeleteButton>
              </Row>
            </Section>
          )}
          <Section>
            <Row>
              <div style={{ flex: 1 }}>
                <Label style={{ marginBottom: 4 }}>Archive this project</Label>
                <Text>
                  Mark this project as archived and read-only. Runs, run logs,
                  and artifacts are preserved.
                </Text>
              </div>
              <DeleteButton onClick={() => props.onArchive()}>
                {isArchived ? "Unarchive Pipeline" : "Archive Pipeline"}
              </DeleteButton>
            </Row>
          </Section>
          <Section>
            <Row>
              <div style={{ flex: 1 }}>
                <Label style={{ marginBottom: 4 }}>Delete this project</Label>
                <Text>
                  Deleting this pipeline will also delete all associated runs,
                  run logs, artifacts, and history.
                </Text>
              </div>
              <DeleteButton onClick={() => props.onDelete()}>
                Delete Pipeline
              </DeleteButton>
            </Row>
          </Section>
        </div>
      </Section>
      <ConfirmArchiveProjectModal
        isOpen={confirmArchiveProjectModalIsOpen}
        close={onClose}
        onArchive={() => onArchive(true)}
        projectSlug={projectSlug}
        isArchived={isArchived}
      />
      <ConfirmDeleteProjectModal
        isOpen={confirmDeleteProjectModalIsOpen}
        close={onClose}
        onDelete={() => onDelete(true)}
        projectSlug={projectSlug}
      />
      <ConfirmProjectVisibiltyModal
        isOpen={confirmProjectVisibilityModalIsOpen}
        close={onClose}
        onChangeVisibility={() => onChangeVisibility(true)}
        isPublic={isPublic}
      />
    </>
  );
};

export default DangerZone;

/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC } from "react";
import { Github } from "@styled-icons/bootstrap";
import { Select } from "baseui/select";
import styles, { Container, Label, Wrapper } from "./styles";

export type OrganizationsProps = {
  orgs: any[];
  current: any;
  onSelect: (value: any) => void;
};

const Organizations: FC<OrganizationsProps> = ({ onSelect, orgs, current }) => {
  return (
    <Container>
      <div style={{ flex: 1 }}>
        <Label>Organization</Label>
        <Wrapper>
          <Github size={20} color="#fff" />
          <Select
            overrides={styles.Select}
            clearable={false}
            options={orgs}
            value={current}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(params: { value: any }) => {
              onSelect(params.value);
            }}
          />
        </Wrapper>
      </div>
      <div>
        <a
          href="https://github.com/apps/fluentci-io/installations/new"
          style={{ color: "#24ffb5", fontSize: 15 }}
        >
          Missing an org?
        </a>
      </div>
    </Container>
  );
};

export default Organizations;

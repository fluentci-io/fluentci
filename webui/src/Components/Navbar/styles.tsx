import styled from "@emotion/styled";

export const Avatar = styled.img<{ size?: number }>`
  cursor: pointer;
  height: 35px;
  width: 35px;
  border-radius: 50%;
  margin-left: 10px;
  ${({ size }) => size && `height: ${size}px; width: ${size}px;`}
`;

export const NoAvatar = styled.div`
  cursor: pointer;
  height: 35px;
  width: 35px;
  border-radius: 50%;
  margin-left: 10px;
  background-color: #0f0124;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #24ffb5 !important;
  }
`;

export const Menu = styled.a`
  cursor: pointer;
  margin-right: 6px;
  margin-left: 6px;
  font-weight: 500;
  padding-left: 12px;
  padding-right: 12px;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 15px;
  // border-bottom: 2px solid transparent;
  color: #fff;

  &:hover {
    color: #24ffb5 !important;
  }
`;

export const PopoverMenu = styled.div`
  background-color: #0f0124;
  width: 280px;
  border-radius: 8px;
  color: #fff;
  position: absolute;
  right: -30px;
  border: 1px solid #6b06ff66;
`;

export const Name = styled.div`
  color: #fff !important;
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
`;

export const Username = styled.div`
  font-size: 14px;
  color: #6b7280;
  margin-left: 6px;
`;

export const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
`;

export const NavbarContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #0f0124;
  width: 90vw;

  @media (min-width: 1400px) {
    width: 85vw;
  }
`;

export const Ul = styled.ul`
  padding: 0;
  background-color: #0f0124;
  list-style-type: none;
`;

export const Li = styled.li`
  cursor: pointer;
  padding-left: 28px;
  padding-right: 28px;
  padding-top: 8px;
  padding-bottom: 8px;
  background-color: #0f0124;
  &:hover {
    color: #24ffb5;
  }
`;

export const SignIn = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border: 1px solid #7392b161;
  padding-left: 18px;
  padding-right: 18px;
  border-radius: 26px;
  background-color: #06e0b021;
  height: 42px;
  width: 80px;
`;

export const SignInLink = styled.a`
  color: #06e0b0;
  font-weight: 500;
  font-size: 15px;
  height: initial;
`;

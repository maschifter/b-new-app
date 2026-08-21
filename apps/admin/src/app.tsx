import PersonIcon from "@mui/icons-material/Person";
import { Admin, Resource } from "react-admin";
import { authProvider } from "./lib/auth-provider";
import { dataProvider } from "./lib/data-provider";
import { AdminLoginPage } from "./pages/admin-login-page";
import { Dashboard } from "./pages/dashboard";
import { UserEdit, UserList, UserShow } from "./resources/users";

export function App() {
  return (
    <Admin
      title="BNewApp Admin"
      dataProvider={dataProvider}
      authProvider={authProvider}
      dashboard={Dashboard}
      loginPage={AdminLoginPage}
      requireAuth
    >
      <Resource
        name="users"
        list={UserList}
        show={UserShow}
        edit={UserEdit}
        icon={PersonIcon}
        recordRepresentation="username"
      />
    </Admin>
  );
}

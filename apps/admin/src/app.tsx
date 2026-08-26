import CategoryIcon from "@mui/icons-material/Category";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import InventoryIcon from "@mui/icons-material/Inventory";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import PersonIcon from "@mui/icons-material/Person";
import { Admin, Resource } from "react-admin";
import { authProvider } from "./lib/auth-provider";
import { dataProvider } from "./lib/data-provider";
import { AdminLoginPage } from "./pages/admin-login-page";
import { Dashboard } from "./pages/dashboard";
import { CatalogCreate, CatalogEdit, CatalogList } from "./resources/catalog";
import { DanceGenreCreate, DanceGenreEdit, DanceGenreList } from "./resources/dance-genres";
import { DanceMoveCreate, DanceMoveEdit, DanceMoveList } from "./resources/dance-moves";
import { MusicTrackCreate, MusicTrackEdit, MusicTrackList } from "./resources/music-tracks";
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
      <Resource
        name="catalog"
        list={CatalogList}
        create={CatalogCreate}
        edit={CatalogEdit}
        icon={InventoryIcon}
        recordRepresentation="display_name"
      />
      <Resource
        name="dance-moves"
        list={DanceMoveList}
        create={DanceMoveCreate}
        edit={DanceMoveEdit}
        icon={DirectionsRunIcon}
        recordRepresentation="title"
      />
      <Resource
        name="dance-genres"
        list={DanceGenreList}
        create={DanceGenreCreate}
        edit={DanceGenreEdit}
        icon={CategoryIcon}
        recordRepresentation="name"
      />
      <Resource
        name="music-tracks"
        list={MusicTrackList}
        create={MusicTrackCreate}
        edit={MusicTrackEdit}
        icon={MusicNoteIcon}
        recordRepresentation="title"
      />
    </Admin>
  );
}

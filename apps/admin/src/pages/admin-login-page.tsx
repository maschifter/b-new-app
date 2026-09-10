import { Login, LoginForm, PasswordInput, TextInput, required } from "react-admin";

const defaultEmail = import.meta.env.DEV ? (import.meta.env.VITE_DEV_ADMIN_EMAIL ?? "") : "";
const defaultPassword = import.meta.env.DEV ? (import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? "") : "";

export function AdminLoginPage() {
  return (
    <Login>
      <LoginForm>
        <TextInput
          autoFocus
          source="username"
          label="Email"
          autoComplete="username"
          defaultValue={defaultEmail}
          validate={required()}
        />
        <PasswordInput
          source="password"
          label="Password"
          autoComplete="current-password"
          defaultValue={defaultPassword}
          validate={required()}
        />
      </LoginForm>
    </Login>
  );
}

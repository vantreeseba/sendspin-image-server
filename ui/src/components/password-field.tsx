import { PasswordField } from "@/components/app-form";
import { PasswordInput } from "@/components/password-input";

// Re-exported as local bindings rather than `export … from`: the shadcn CLI rewrites import
// declarations on install and leaves re-export declarations alone, so the `from` form would ship
// a path that does not exist in a consumer's tree. See AGENTS.md.
export { PasswordField, PasswordInput };

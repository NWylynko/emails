import { UpdatesProvider } from "@/providers/UpdatesProvider";

export default function AuthenticatedLayout(props: LayoutProps<"/">) {
  return <UpdatesProvider>{props.children}</UpdatesProvider>;
}

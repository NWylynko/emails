import { SignIn } from "@clerk/nextjs";

export default function Page(props: PageProps<"/sign-in/[[...sign-in]]">) {
  return (
    <main className="flex justify-center items-center h-[80svh]">
      <SignIn />
    </main>
  );
}

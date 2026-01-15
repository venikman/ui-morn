import { ScenarioRunner } from "../components/ScenarioRunner";

export default function Home() {
  return (
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-20 pt-10 sm:px-6 lg:px-12">
      <ScenarioRunner />
    </main>
  );
}

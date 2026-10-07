import type { Metadata } from "next";

import { RegisterForm } from "./form";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <RegisterForm next={next} />;
}

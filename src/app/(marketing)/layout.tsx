import { Navbar } from "@/components/Navbar";

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col">
			<Navbar />
			<main className="flex-1">{children}</main>
		</div>
	);
}

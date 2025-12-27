import { formatDistanceToNow } from "date-fns";
import { getQStashEvents } from "@/lib/qstash";

// Revalidate every minute
export const revalidate = 60;

export default async function JobsPage() {
	const { events } = await getQStashEvents();

	return (
		<div className="p-6 space-y-8">
			<div>
				<h1 className="text-2xl font-bold mb-2">Background Jobs</h1>
				<p className="text-muted-foreground">
					Monitor QStash maintenance jobs and trigger manual runs.
				</p>
			</div>

			{/* Manual Triggers Card */}
			<div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
				<h2 className="text-lg font-semibold mb-4">Manual Triggers</h2>
				<div className="flex gap-4 flex-wrap">
					<form
						action={async () => {
							"use server";
							// In a real app, use a proper server action, but for this admin panel fetch is simple
							// But server components can't fetch strictly local API routes with relative paths usually.
							// Relying on public public url or localhost.
							const secret = process.env.CRON_SECRET;
							const appUrl =
								process.env.APP_URL || "http://localhost:3000";
							await fetch(`${appUrl}/api/cron/trigger?job=all`, {
								headers: { Authorization: `Bearer ${secret}` },
							});
						}}>
						<button
							type="submit"
							className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition">
							Run All Maintenance
						</button>
					</form>

					<form
						action={async () => {
							"use server";
							const secret = process.env.CRON_SECRET;
							const appUrl =
								process.env.APP_URL || "http://localhost:3000";
							await fetch(
								`${appUrl}/api/cron/trigger?job=consolidate`,
								{
									headers: {
										Authorization: `Bearer ${secret}`,
									},
								}
							);
						}}>
						<button
							type="submit"
							className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition">
							Consolidate Memories
						</button>
					</form>

					<form
						action={async () => {
							"use server";
							const secret = process.env.CRON_SECRET;
							const appUrl =
								process.env.APP_URL || "http://localhost:3000";
							await fetch(
								`${appUrl}/api/cron/trigger?job=archive`,
								{
									headers: {
										Authorization: `Bearer ${secret}`,
									},
								}
							);
						}}>
						<button
							type="submit"
							className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition">
							Archive Sessions
						</button>
					</form>

					<form
						action={async () => {
							"use server";
							const secret = process.env.CRON_SECRET;
							const appUrl =
								process.env.APP_URL || "http://localhost:3000";
							await fetch(
								`${appUrl}/api/cron/trigger?job=analyze`,
								{
									headers: {
										Authorization: `Bearer ${secret}`,
									},
								}
							);
						}}>
						<button
							type="submit"
							className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition">
							Analyze Profiles
						</button>
					</form>
				</div>
			</div>

			{/* Events Table */}
			<div className="border rounded-lg overflow-hidden">
				<table className="w-full text-sm">
					<thead className="bg-muted text-muted-foreground border-b">
						<tr>
							<th className="p-3 text-left">ID</th>
							<th className="p-3 text-left">State</th>
							<th className="p-3 text-left">Time</th>
							<th className="p-3 text-left">Destination</th>
						</tr>
					</thead>
					<tbody>
						{(events || []).map((event) => (
							<tr
								key={event.messageId}
								className="border-b last:border-0 hover:bg-muted/50">
								<td className="p-3 font-mono text-xs">
									{event.messageId}
								</td>
								<td className="p-3">
									<span
										className={`px-2 py-1 rounded text-xs font-medium ${
											event.state === "DELIVERED"
												? "bg-green-100 text-green-700"
												: event.state === "FAILED"
												? "bg-red-100 text-red-700"
												: "bg-yellow-100 text-yellow-700"
										}`}>
										{event.state}
									</span>
								</td>
								<td className="p-3 text-muted-foreground">
									{formatDistanceToNow(new Date(event.time), {
										addSuffix: true,
									})}
								</td>
								<td className="p-3 font-mono text-xs truncate max-w-[200px]">
									{event.url}
								</td>
							</tr>
						))}
						{(!events || events.length === 0) && (
							<tr>
								<td
									colSpan={4}
									className="p-8 text-center text-muted-foreground">
									No recent events found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

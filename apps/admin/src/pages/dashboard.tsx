import type { DashboardSummary } from "@bnewapp/types";
import GroupIcon from "@mui/icons-material/Group";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import { Alert, Box, Card, CardContent, CardHeader, CircularProgress, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Title } from "react-admin";
import { fetchDashboardSummary } from "../lib/data-provider";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Box>
      <Typography variant="h4">{value.toLocaleString()}</Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardSummary()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ mt: 2 }}>
      <Title title="Dashboard" />
      {failed && <Alert severity="error">Could not load dashboard metrics.</Alert>}
      {!failed && !summary && <CircularProgress aria-label="Loading dashboard" />}
      {summary && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
            gap: 2,
          }}
        >
          <Card>
            <CardHeader avatar={<GroupIcon color="primary" />} title="Users" />
            <CardContent sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Metric label="Total" value={summary.users.total} />
              <Metric label="New in 24h" value={summary.users.last24h} />
              <Metric label="New in 7d" value={summary.users.last7d} />
              <Metric label="New in 30d" value={summary.users.last30d} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader avatar={<MeetingRoomIcon color="primary" />} title="Studio rooms" />
            <CardContent sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Metric label="Total" value={summary.rooms.total} />
              <Metric label="Updated in 7d" value={summary.rooms.updatedLast7d} />
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}

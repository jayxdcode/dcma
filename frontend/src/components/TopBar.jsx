// src/components/TopBar.jsx
import React, { useEffect, useState } from 'react';
import {
	Typography,
	Avatar,
	Box,
	IconButton,
	Popover,
	Card,
	CardContent,
	CardActions,
	Button,
	Tooltip,
	Link,
	Divider,
	Stack,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import InfoIcon from '@mui/icons-material/Info';
import { useModals } from './ModalProvider';
import htrImgUrl from '../../assets/htr.png';

// ---------- Helpers ------------
window.toggleLogs = () => {
	const logs = document.querySelector('#htr-logs');
	logs.classList.toggle('hidden');
}

async function getRepoDescription(owner, repo) {
	const url = `https://api.github.com/repos/${owner}/${repo}`;

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		if (!response.ok) {
			throw new Error(`Error: ${response.status} - ${response.statusText}`);
		}

		const data = await response.json();
		return data.description || '';
	} catch (error) {
		console.error('Failed to fetch repository data:', error);
		return '';
	}
}

async function copyToClipboard(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (err) {
		console.error('Clipboard copy failed:', err);
		return false;
	}
}

// ---------- AppCard (shown inside Popover) ----------
function AppCard({
	appName,
	appIconUrl,
	repoOwner,
	repoName,
	repoUrl,
	issueUrl,
	onClose,
}) {
	
	const { showAlert } = useModals();
	const [repoSummary, setRepoSummary] = useState('');

	useEffect(() => {
		let alive = true;

		async function loadSummary() {
			const summary = await getRepoDescription(repoOwner, repoName);
			if (alive) setRepoSummary(summary);
		}

		loadSummary();

		return () => {
			alive = false;
		};
	}, [repoOwner, repoName]);

	async function handleOpenRepo() {
		const w = window.open(repoUrl, '_blank', 'noopener,noreferrer');

		if (!w) {
			const copied = await copyToClipboard(repoUrl);
			showAlert(
				copied
					? 'Repo link copied to clipboard.'
					: 'Could not open repo link and failed to copy it.'
			);
		} else {
			try {
				w.focus();
			} catch (e) {}
			onClose?.();
		}
	}

	async function handleCopyRepo() {
		const copied = await copyToClipboard(repoUrl);
		showAlert(
			copied
				? 'Repository link copied to clipboard.'
				: 'Failed to copy repo link.'
		);
	}

	async function handleOpenIssue() {
		const w = window.open(issueUrl, '_blank', 'noopener,noreferrer');

		if (!w) {
			const copied = await copyToClipboard(issueUrl);
			showAlert(
				copied
					? 'Issue link copied to clipboard.'
					: 'Could not open issue page and failed to copy it.'
			);
		} else {
			try {
				w.focus();
			} catch (e) {}
			onClose?.();
		}
	}

	return (
		<Card sx={{ width: 320, p: 0 }}>
			<CardContent>
				<Stack direction="row" spacing={2} alignItems="center">
					<Avatar
						src={appIconUrl}
						alt={appName}
						sx={{ width: 64, height: 64, borderRadius: '12px' }}
					/>
					<Box>
						<Typography variant="subtitle1" fontWeight={700}>
							{appName}
						</Typography>

						{repoSummary ? (
							<Typography variant="body2" sx={{ opacity: 0.85 }}>
								{repoSummary}
							</Typography>
						) : (
							<Typography variant="body2" color="text.secondary">
								No description available.
							</Typography>
						)}

						<Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
							<Link
								href={repoUrl}
								target="_blank"
								rel="noreferrer"
								underline="none"
								color="inherit"
							>
								<Button size="small" startIcon={<OpenInNewIcon fontSize="small" />}>
									View Repo
								</Button>
							</Link>
						</Stack>
					</Box>
				</Stack>

				<Divider sx={{ my: 1.5 }} />

				<Typography variant="body2" color="text.secondary">
					Have a feature in mind or found a bug?
				</Typography>
			</CardContent>

			<CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
				<Box>
					<Tooltip title="Open an issue">
						<Button size="small" variant="contained" onClick={handleOpenIssue}>
							Open an issue
						</Button>
					</Tooltip>
				</Box>

				<Box sx={{ display: 'flex', gap: 1 }}>
					<Tooltip title="Copy repo link">
						<IconButton size="small" onClick={handleCopyRepo}>
							<ContentCopyIcon fontSize="small" />
						</IconButton>
					</Tooltip>

					<Tooltip title="Repo info">
						<IconButton
							size="small"
							disabled={!repoUrl}
							href={repoUrl}
							component={repoUrl ? 'a' : 'button'}
							target="_blank"
							rel="noreferrer"
						>
							<InfoIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
			</CardActions>
		</Card>
	);
}

// ---------- TopBar ----------
export default function TopBar({
	appName: propAppName,
	appIconUrl: propAppIconUrl,
	repoOwner = 'jayxdcode',
	repoName = 'dcma',
	repoUrl = 'https://github.com/jayxdcode/dcma',
}) {
	const [anchorEl, setAnchorEl] = useState(null);
	const [iconUrl, setIconUrl] = useState(propAppIconUrl || htrImgUrl);

	const appName =
		propAppName ||
		(typeof document !== 'undefined' ? document.title : 'App');

	const issueUrl = `${repoUrl.replace(/\/$/, '')}/issues/new`;

	useEffect(() => {
		setIconUrl(propAppIconUrl || htrImgUrl);
	}, [propAppIconUrl]);

	const handleOpen = (e) => setAnchorEl(e.currentTarget);
	const handleClose = () => setAnchorEl(null);
	const open = Boolean(anchorEl);
	const id = open ? 'app-popover' : undefined;

	return (
		<div
			className="app-header"
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 12,
			}}
		>
			<div
				className="h-stack"
				style={{ display: 'flex', alignItems: 'center', gap: 12 }}
			>
				<div
					style={{
						width: 36,
						height: 36,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: 8,
						background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
					}}
				>
					<GraphicEqIcon sx={{ color: '#000', fontSize: 20 }} />
				</div>
				<Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.5 }}>
					{appName}
				</Typography>
				<Typography variant="caption" sx={{ opacity: 0.6, fontSize: '0.7rem', letterSpacing: 0.5 }}>
					{window.hitori.versionNumber}
				</Typography>
			</div>

			<Box>
				<Tooltip title="Repo profile">
					<IconButton aria-describedby={id} onClick={handleOpen} size="small" sx={{ p: 0 }}>
						<Avatar
							src={iconUrl}
							alt={appName}
							sx={{
								width: 36,
								height: 36,
								borderRadius: '50%',
								bgcolor: 'rgba(255,255,255,0.04)',
								border: '1px solid rgba(255,255,255,0.06)',
							}}
						/>
					</IconButton>
				</Tooltip>

				<Popover
					id={id}
					open={open}
					anchorEl={anchorEl}
					onClose={handleClose}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
					transformOrigin={{ vertical: 'top', horizontal: 'right' }}
					disableRestoreFocus
				>
					<Box sx={{ p: 1 }}>
						<AppCard
							appName={appName}
							appIconUrl={iconUrl}
							repoOwner={repoOwner}
							repoName={repoName}
							repoUrl={repoUrl}
							issueUrl={issueUrl}
							onClose={handleClose}
						/>
					</Box>
				</Popover>
			</Box>
		</div>
	);
}

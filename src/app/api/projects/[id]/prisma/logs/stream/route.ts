import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getRunLogs, getRunStatus } from '@/lib/runner';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/prisma/logs/stream - Stream logs for a run (SSE)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  // Note: We don't use the project id directly, but we verify the user is authenticated
  await params;

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json(
      { error: 'runId query parameter is required' },
      { status: 400 }
    );
  }

  // Get run status
  const status = await getRunStatus(runId);
  if (!status) {
    return NextResponse.json(
      { error: 'Run not found' },
      { status: 404 }
    );
  }

  // If run is complete, just return the logs as JSON
  if (status.status === 'success' || status.status === 'failed') {
    const logs = await getRunLogs(runId);
    return NextResponse.json({
      status: status.status,
      exitCode: status.exitCode,
      logs: logs.map(l => l.line),
      complete: true,
    });
  }

  // For running jobs, set up SSE
  const encoder = new TextEncoder();
  let lastLogIndex = 0;
  let isComplete = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Poll for logs
      const pollLogs = async () => {
        while (!isComplete) {
          try {
            const logs = await getRunLogs(runId, 1000);
            
            // Send new logs
            if (logs.length > lastLogIndex) {
              const newLogs = logs.slice(lastLogIndex);
              for (const log of newLogs) {
                sendEvent('log', { line: log.line, ts: log.ts });
              }
              lastLogIndex = logs.length;
            }

            // Check if run is complete
            const currentStatus = await getRunStatus(runId);
            if (currentStatus && (currentStatus.status === 'success' || currentStatus.status === 'failed')) {
              sendEvent('complete', {
                status: currentStatus.status,
                exitCode: currentStatus.exitCode,
              });
              isComplete = true;
              controller.close();
              return;
            }

            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            sendEvent('error', { message: (error as Error).message });
            isComplete = true;
            controller.close();
            return;
          }
        }
      };

      // Start polling
      pollLogs();
    },
    cancel() {
      isComplete = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

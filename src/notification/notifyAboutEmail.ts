/**
 * Push notification for an inbound (or proxied) message, via Pusher Beams to
 * every browser / Home Screen web app registered on the "emails" interest.
 */

function emailUrl(env: CloudflareEnv, emailId: number) {
  return `${env.SITE_URL}/email/${emailId}`;
}

/**
 * Beams failures are logged and swallowed — matching the original. A throw here
 * would fail the whole `email()` handler, and Email Routing retries a failed
 * delivery, which re-runs the INSERT and leaves duplicate rows.
 */
async function sendToPusherBeams(
  env: CloudflareEnv,
  emailId: number,
  title: string,
  body: string
) {
  try {
    const response = await fetch(
      `https://${env.BEAMS_INSTANCE_ID}.pushnotifications.pusher.com/publish_api/v1/instances/${env.BEAMS_INSTANCE_ID}/publishes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.BEAMS_SECRET}`,
        },
        body: JSON.stringify({
          interests: ["emails"],
          web: {
            notification: {
              title,
              body,
              deep_link: emailUrl(env, emailId),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "sendToPusherBeams rejected",
        JSON.stringify({
          status: response.status,
          body: (await response.text()).slice(0, 500),
        })
      );
    }
  } catch (error) {
    console.error("sendToPusherBeams failed", error);
  }
}

export async function notifyAboutEmail(
  env: CloudflareEnv,
  emailId: number,
  title: string,
  body: string
) {
  await sendToPusherBeams(env, emailId, title, body);
}

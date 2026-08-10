/**
 * Push notification for an inbound (or proxied) message.
 *
 * Two independent services get the same title and body: Pusher Beams for the
 * installed web app, and Push by Techulus for Nick's phone. In the standalone
 * service this pair was written out twice, once per branch of the email
 * handler, which is how they drifted.
 *
 * NOTE: credentials are hardcoded here exactly as they were in the standalone
 * service. They belong in secrets — tracked in AGENTS.md under cleanups.
 */
const BEAMS_INSTANCE_ID = "656479b8-e3ae-4b4e-852f-4af9c65d27a8";
const BEAMS_SECRET =
  "REDACTED-rotated";
const TECHULUS_API_KEY = "REDACTED-rotated";

function emailUrl(emailId: number) {
  return `https://emails.wylynko.me/email/${emailId}`;
}

/**
 * Beams failures are logged and swallowed — matching the original. A throw here
 * would fail the whole `email()` handler, and Email Routing retries a failed
 * delivery, which re-runs the INSERT and leaves duplicate rows.
 */
async function sendToPusherBeams(
  emailId: number,
  title: string,
  body: string
) {
  try {
    const response = await fetch(
      `https://${BEAMS_INSTANCE_ID}.pushnotifications.pusher.com/publish_api/v1/instances/${BEAMS_INSTANCE_ID}/publishes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BEAMS_SECRET}`,
        },
        body: JSON.stringify({
          interests: ["emails"],
          web: {
            notification: {
              title,
              body,
              deep_link: emailUrl(emailId),
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

/**
 * Techulus failures DO throw, matching the original. Be aware that means a
 * Techulus outage fails the handler and Email Routing retries the delivery,
 * duplicating the row it already inserted.
 */
async function sendToTechulus(emailId: number, title: string, body: string) {
  const response = await fetch("https://push.techulus.com/api/v1/notify", {
    method: "POST",
    headers: {
      "x-api-key": TECHULUS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: "emails",
      timeSensitive: false,
      title,
      body,
      link: emailUrl(emailId),
      image: "https://emails.wylynko.me/logo.png",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Push Error: ${response.status} - ${response.statusText}`
    );
  }
}

export async function notifyAboutEmail(
  emailId: number,
  title: string,
  body: string
) {
  await sendToPusherBeams(emailId, title, body);
  await sendToTechulus(emailId, title, body);
}

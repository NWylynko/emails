/**
 * Push notification for an inbound (or proxied) message.
 *
 * Two independent services get the same title and body: Pusher Beams for the
 * installed web app, and Push by Techulus for Nick's phone. In the standalone
 * service this pair was written out twice, once per branch of the email
 * handler, which is how they drifted.
 *
 */

function emailUrl(emailId: number) {
  return `https://emails.wylynko.me/email/${emailId}`;
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
async function sendToTechulus(
  env: CloudflareEnv,
  emailId: number,
  title: string,
  body: string
) {
  const response = await fetch("https://push.techulus.com/api/v1/notify", {
    method: "POST",
    headers: {
      "x-api-key": env.TECHULUS_API_KEY,
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
  env: CloudflareEnv,
  emailId: number,
  title: string,
  body: string
) {
  await sendToPusherBeams(env, emailId, title, body);
  await sendToTechulus(env, emailId, title, body);
}

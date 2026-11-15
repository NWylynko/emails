"use client"

import * as PusherPushNotifications from "@pusher/push-notifications-web";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner"
import { Loader2 } from "lucide-react";

const INTEREST = 'emails';

/**
 * iOS only exposes Web Push to a page opened from a Home Screen web app
 * (display: standalone). In a Safari tab `PushManager` is missing and the Beams
 * SDK's start() silently returns, so detect it ourselves and say why.
 */
const isWebPushAvailable = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'PushManager' in window &&
  'serviceWorker' in navigator;

/**
 * `instanceId` is a public identifier — the Beams browser SDK needs it to
 * register a device — so it arrives as a prop from the server page rather than
 * being hardcoded or exposed via NEXT_PUBLIC_. The matching secret
 * (BEAMS_SECRET) never leaves the Worker.
 */
export const PushNotifications = (props: { instanceId: string }) => {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [webPushUnavailable, setWebPushUnavailable] = useState(false);
  const [beamsClient, setBeamsClient] = useState<PusherPushNotifications.Client | null>(null);

  useEffect(() => {
    if (!isWebPushAvailable()) {
      setWebPushUnavailable(true);
      setIsRegistered(false);
      return;
    }

    const client = new PusherPushNotifications.Client({
      instanceId: props.instanceId,
    });
    setBeamsClient(client);

    const checkRegistration = async () => {
      try {
        const state = await client.getRegistrationState();

        if (state === PusherPushNotifications.RegistrationState.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setIsRegistered(false);
          return;
        }

        if (state === PusherPushNotifications.RegistrationState.PERMISSION_GRANTED_REGISTERED_WITH_BEAMS) {
          // SDK 2.x returns { interests } despite its .d.ts still saying string[].
          const { interests } = (await client.getDeviceInterests()) as unknown as { interests: string[] };
          setIsRegistered(interests.includes(INTEREST));
        } else {
          setIsRegistered(false);
        }
      } catch (error) {
        console.error('Failed to check registration:', error);
        setIsRegistered(false);
      }
    };

    checkRegistration();

    return () => {
      setBeamsClient(null);
    };
  }, [props.instanceId]);

  const handleSetup = useCallback(async () => {
    if (!beamsClient) return;

    try {
      setIsSettingUp(true);

      // Must be the first await: iOS only shows the permission prompt in direct
      // response to the tap. Left to the SDK, it is requested inside
      // pushManager.subscribe() after network round-trips, by which point the
      // gesture is gone.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error("Notifications are blocked. Please enable them in your browser settings.");
        setPermissionDenied(permission === 'denied');
        return;
      }

      const state = await beamsClient.getRegistrationState();

      if (state === PusherPushNotifications.RegistrationState.PERMISSION_DENIED) {
        toast.error("Notifications are blocked. Please enable them in your browser settings.");
        setPermissionDenied(true);
        return;
      }

      if (state !== PusherPushNotifications.RegistrationState.PERMISSION_GRANTED_REGISTERED_WITH_BEAMS) {
        await beamsClient.start();
      }

      await beamsClient.addDeviceInterest(INTEREST);
      setIsRegistered(true);
      toast.success("Push notifications have been set up successfully!");
    } catch (error) {
      console.error('Failed to setup notifications:', error);
      toast.error(`Failed to setup push notifications: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSettingUp(false);
    }
  }, [beamsClient]);

  const handleRemove = useCallback(async () => {
    if (!beamsClient) return;

    try {
      setIsRemoving(true);
      await beamsClient.removeDeviceInterest(INTEREST);
      setIsRegistered(false);
      toast.success("Push notifications have been removed successfully!");
    } catch (error) {
      console.error('Failed to remove notifications:', error);
      toast.error("Failed to remove push notifications. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  }, [beamsClient]);

  if (isRegistered === null) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">
          Checking notification status...
        </span>
      </div>
    );
  }

  if (webPushUnavailable) {
    return (
      <div className="text-sm text-muted-foreground">
        Push notifications aren&apos;t available here. On iPhone, open this site from its Home Screen icon (Share → Add to Home Screen, with &quot;Open as Web App&quot; on).
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="text-sm text-muted-foreground">
        Notifications are blocked. Please enable them in your browser settings.
      </div>
    );
  }

  return (
    <>
      {!isRegistered ? (
        <Button
          onClick={handleSetup}
          disabled={isSettingUp || !beamsClient}
        >
          {isSettingUp ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : (
            'Setup Push Notifications'
          )}
        </Button>
      ) : (
        <Button
          onClick={handleRemove}
          disabled={isRemoving || !beamsClient}
          variant="outline"
        >
          {isRemoving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Removing...
            </>
          ) : (
            'Remove Push Notifications'
          )}
        </Button>
      )}
    </>
  );
};
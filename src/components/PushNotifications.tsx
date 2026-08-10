"use client"

import * as PusherPushNotifications from "@pusher/push-notifications-web";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner"
import { Loader2 } from "lucide-react";

const INTEREST = 'emails';

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
  const [beamsClient, setBeamsClient] = useState<PusherPushNotifications.Client | null>(null);

  useEffect(() => {
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
          const interests = await client.getDeviceInterests();
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
      toast.error("Failed to setup push notifications. Please try again.");
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
-- A delivery lease needs an ownership fence: an expired sender must not be
-- able to settle a response after a later retry acquires the same request.
ALTER TABLE "ChannelConnectRequest"
  ADD COLUMN "claimToken" TEXT;

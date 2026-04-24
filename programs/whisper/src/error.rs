use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Agent is already registered for this authority")]
    AlreadyRegistered,
    #[msg("Listing has expired (past ttl_slot)")]
    ListingExpired,
    #[msg("Listing is not in Active status")]
    ListingNotActive,
    #[msg("Signer is not the buyer of this purchase")]
    NotBuyer,
    #[msg("Signer is not the supplier of this listing")]
    NotSupplier,
    #[msg("Payload has already been delivered")]
    AlreadyDelivered,
    #[msg("Rating has already been submitted for this purchase")]
    AlreadyRated,
    #[msg("listing_id does not match supplier's counter")]
    ListingIdMismatch,
    #[msg("Supplier authority wallet does not match supplier agent")]
    UnauthorizedSupplier,
    #[msg("Handle exceeds 32 characters")]
    HandleTooLong,
    #[msg("CID exceeds 64 characters")]
    CidTooLong,
    #[msg("Payload has not been delivered yet")]
    NotDelivered,
}

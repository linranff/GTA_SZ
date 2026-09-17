#include "WalletSubsystem.h"

void UShenchengjiWalletSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Cash = 180;
	PaidIds.Reset();
}

bool UShenchengjiWalletSubsystem::Credit(const FString& Id, int32 Amount)
{
	if (Id.IsEmpty() || Id.Len() > 80 || Amount < 0)
	{
		return false;
	}
	if (PaidIds.Contains(Id))
	{
		return true;
	}
	PaidIds.Add(Id);
	Cash = FMath::Clamp(Cash + Amount, 0, 10000000);
	return true;
}

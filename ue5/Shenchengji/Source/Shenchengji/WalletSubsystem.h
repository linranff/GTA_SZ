#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "WalletSubsystem.generated.h"

/** Single wallet credit path. Duplicate ids never pay twice. */
UCLASS()
class SHENCHENGJI_API UShenchengjiWalletSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UFUNCTION(BlueprintCallable, Category = "深城纪|钱包")
	bool Credit(const FString& Id, int32 Amount);

	UFUNCTION(BlueprintPure, Category = "深城纪|钱包")
	int32 GetCash() const { return Cash; }

	UFUNCTION(BlueprintPure, Category = "深城纪|钱包")
	bool HasPaid(const FString& Id) const { return PaidIds.Contains(Id); }

private:
	UPROPERTY()
	int32 Cash = 180;

	UPROPERTY()
	TSet<FString> PaidIds;
};

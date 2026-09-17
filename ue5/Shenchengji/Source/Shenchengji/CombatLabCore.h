#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "CombatLabCore.generated.h"

/** Independent training weapon. Do not spawn this inside the city life game mode. */
USTRUCT(BlueprintType)
struct SHENCHENGJI_API FShenchengjiCombatWeapon
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	FString Id = TEXT("helix-trainer-ix");

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	FString Name = TEXT("螺旋训械 IX");

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	int32 MagazineSize = 10;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	int32 ReserveCapacity = 30;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	float FireIntervalSeconds = 0.18f;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|战斗试验")
	float ReloadSeconds = 1.5f;
};

UCLASS()
class SHENCHENGJI_API AShenchengjiCombatLabGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AShenchengjiCombatLabGameMode();
	virtual void StartPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "深城纪|战斗试验")
	FShenchengjiCombatWeapon Weapon;
};

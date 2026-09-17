#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "LifeHud.generated.h"

UCLASS()
class SHENCHENGJI_API AShenchengjiLifeHud : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

	UPROPERTY()
	FString Objective;

	UPROPERTY()
	FString Prompt;

	UPROPERTY()
	FString Dialogue;

	UPROPERTY()
	FString ChoiceA;

	UPROPERTY()
	FString ChoiceB;

	UPROPERTY()
	int32 Cash = 180;

	UPROPERTY()
	bool bWalking = false;
};

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "CareerGame.h"
#include "CityTypes.h"
#include "StoryGame.h"
#include "CitySubsystem.generated.h"

class AShenchengjiCitySkeletonActor;
class AShenchengjiLifeHud;
class AShenchengjiWalker;
class AWheeledVehiclePawn;
class UShenchengjiWalletSubsystem;

UCLASS()
class SHENCHENGJI_API UShenchengjiCitySubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UShenchengjiCitySubsystem, STATGROUP_Tickables); }

	UFUNCTION()
	bool StartLastDelivery();

	UFUNCTION()
	bool Interact();

	UFUNCTION()
	bool ChooseStory(const FString& ChoiceId);

	UFUNCTION()
	void ToggleWalk();

	UFUNCTION()
	void HandleInteract() { Interact(); }

	UFUNCTION()
	void HandleStartStory() { StartLastDelivery(); }

	UFUNCTION()
	void ChooseOne() { ChooseStory(TEXT("go-bay-direct")); }

	UFUNCTION()
	void ChooseTwo() { ChooseStory(TEXT("detour-park")); }

	UFUNCTION()
	void AcceptJob3() { AcceptJobByIndex(0); }

	UFUNCTION()
	void AcceptJob4() { AcceptJobByIndex(1); }

	UFUNCTION()
	void AcceptJob5() { AcceptJobByIndex(2); }

	UFUNCTION()
	void AcceptJob6() { AcceptJobByIndex(3); }

	UFUNCTION()
	void AcceptJob7() { AcceptJobByIndex(4); }

	UFUNCTION()
	void AcceptJob8() { AcceptJobByIndex(5); }

	const FShenchengjiCitySkeleton& GetSkeleton() const { return Skeleton; }

private:
	void SpawnCity(UWorld& World);
	void EnsureLighting(UWorld& World);
	void TeleportPlayer();
	void BindInput();
	void RefreshHud();
	void AcceptJobByIndex(int32 Index);
	FShenchengjiStoryFrame MakeStoryFrame() const;
	FShenchengjiCareerFrame MakeCareerFrame() const;
	void ReadPawn(double& OutX, double& OutZ, double& OutSpeed, bool& bWalkingNow) const;

	FShenchengjiCitySkeleton Skeleton;
	FShenchengjiStoryGame Story;
	FShenchengjiCareerGame Career;
	TObjectPtr<AShenchengjiCitySkeletonActor> CityActor;
	TObjectPtr<AShenchengjiWalker> Walker;
	TObjectPtr<APawn> Vehicle;
	TObjectPtr<AShenchengjiLifeHud> Hud;
	bool bWalking = false;
	bool bInputBound = false;
	double Odometer = 0;
};
